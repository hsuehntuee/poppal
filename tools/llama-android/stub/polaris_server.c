// 在 App 程序裡啟動 llama-server（不另外 exec）：
// 直接 exec 的子程序拿不到 vendor 的 libcdsprpc.so / libOpenCL.so（linker namespace 不同），Hexagon NPU 就註冊不了；
// 在 App 程序裡 dlopen libllama-server-impl.so 再呼叫 llama_server(argc, argv)，就跟一般用 NPU 的 App 一樣。
// 編譯：clang --target=aarch64-linux-android24 -shared -fPIC -O2 -Wl,-soname,libpolaris_server.so -o libpolaris_server.so polaris_server.c -llog
#include <jni.h>
#include <dlfcn.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <android/log.h>

#define TAG "llm-server"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

typedef int (*llama_server_fn)(int, char**);

#include <unistd.h>
#include <stdio.h>
// llama-server 的 log 走 stderr/stdout；App 程序裡沒人看，接到 logcat
static void* pump(void* p) {
  int fd = (int)(long)p;
  char buf[2048];
  size_t n = 0;
  for (;;) {
    ssize_t r = read(fd, buf + n, sizeof(buf) - 1 - n);
    if (r <= 0) break;
    n += (size_t)r;
    buf[n] = 0;
    char* line = buf;
    char* nl;
    while ((nl = strchr(line, '\n')) != NULL) {
      *nl = 0;
      if (*line) __android_log_print(ANDROID_LOG_INFO, TAG, "%s", line);
      line = nl + 1;
    }
    n = strlen(line);
    memmove(buf, line, n + 1);
    if (n >= sizeof(buf) - 2) n = 0;
  }
  return NULL;
}
static void redirect_to_logcat(void) {
  static int done = 0;
  if (done) return;
  done = 1;
  int fds[2];
  if (pipe(fds) != 0) return;
  dup2(fds[1], 1);
  dup2(fds[1], 2);
  setvbuf(stdout, NULL, _IOLBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
  pthread_t t;
  pthread_create(&t, NULL, pump, (void*)(long)fds[0]);
  pthread_detach(t);
}

struct run_args {
  int argc;
  char** argv;
};

static void* run_server(void* p) {
  struct run_args* a = (struct run_args*)p;
  void* h = dlopen("libllama-server-impl.so", RTLD_NOW | RTLD_GLOBAL);
  if (!h) {
    LOGE("dlopen libllama-server-impl.so failed: %s", dlerror());
    return NULL;
  }
  llama_server_fn fn = (llama_server_fn)dlsym(h, "_Z12llama_serveriPPc");
  if (!fn) {
    LOGE("dlsym llama_server failed: %s", dlerror());
    return NULL;
  }
  LOGI("llama_server starting in-process (argc=%d)", a->argc);
  int rc = fn(a->argc, a->argv);
  LOGI("llama_server returned %d", rc);
  return NULL;
}

JNIEXPORT jint JNICALL Java_com_example_townpass_MainActivity_nativeStartServer(JNIEnv* env, jobject thiz, jobjectArray jargs, jstring jlibdir) {
  redirect_to_logcat();
  const char* libdir = (*env)->GetStringUTFChars(env, jlibdir, NULL);
  // HTP skel（libggml-htp-vNN.so）要從這裡載入
  setenv("ADSP_LIBRARY_PATH", libdir, 1);
  setenv("CDSP_LIBRARY_PATH", libdir, 1);
  setenv("DSP_LIBRARY_PATH", libdir, 1);
  setenv("LD_LIBRARY_PATH", libdir, 1);
  setenv("GGML_HEXAGON_VERBOSE", "1", 1);
  (*env)->ReleaseStringUTFChars(env, jlibdir, libdir);

  int n = (*env)->GetArrayLength(env, jargs);
  struct run_args* a = (struct run_args*)calloc(1, sizeof(struct run_args));
  a->argc = n + 1;
  a->argv = (char**)calloc((size_t)n + 2, sizeof(char*));
  a->argv[0] = strdup("llama-server");
  for (int i = 0; i < n; i++) {
    jstring s = (jstring)(*env)->GetObjectArrayElement(env, jargs, i);
    const char* c = (*env)->GetStringUTFChars(env, s, NULL);
    a->argv[i + 1] = strdup(c);
    (*env)->ReleaseStringUTFChars(env, s, c);
    (*env)->DeleteLocalRef(env, s);
  }
  pthread_t t;
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
  pthread_attr_setstacksize(&attr, 16 * 1024 * 1024);
  int rc = pthread_create(&t, &attr, run_server, a);
  pthread_attr_destroy(&attr);
  if (rc != 0) LOGE("pthread_create failed: %d", rc);
  return rc;
}
