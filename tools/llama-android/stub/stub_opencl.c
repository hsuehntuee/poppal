// libOpenCL.so 替身：App 程序的 linker namespace 看不到 vendor 的 libOpenCL.so，少了它整個 llama-server 連結不起來。
// 每個函式回 CL_PLATFORM_NOT_FOUND_KHR(-1001)，ggml-opencl 找不到平台就自己關掉，改用 Hexagon NPU / CPU。
// 符號有版本（clX@OPENCL_1.0），所以要配 version script：
//   clang --target=aarch64-linux-android24 -shared -fPIC -O1 -Wl,-soname,libOpenCL.so -Wl,--version-script=opencl.map -o libOpenCL.so stub_opencl.c

long clBuildProgram(void) { return -1001; }
long clCreateBuffer(void) { return -1001; }
long clCreateBufferWithProperties(void) { return -1001; }
long clCreateCommandQueue(void) { return -1001; }
long clCreateContext(void) { return -1001; }
long clCreateImage(void) { return -1001; }
long clCreateKernel(void) { return -1001; }
long clCreateProgramWithBinary(void) { return -1001; }
long clCreateProgramWithSource(void) { return -1001; }
long clCreateSubBuffer(void) { return -1001; }
long clEnqueueBarrierWithWaitList(void) { return -1001; }
long clEnqueueCopyBuffer(void) { return -1001; }
long clEnqueueFillBuffer(void) { return -1001; }
long clEnqueueMapBuffer(void) { return -1001; }
long clEnqueueMarkerWithWaitList(void) { return -1001; }
long clEnqueueNDRangeKernel(void) { return -1001; }
long clEnqueueReadBuffer(void) { return -1001; }
long clEnqueueUnmapMemObject(void) { return -1001; }
long clEnqueueWriteBuffer(void) { return -1001; }
long clFinish(void) { return -1001; }
long clFlush(void) { return -1001; }
long clGetDeviceIDs(void) { return -1001; }
long clGetDeviceInfo(void) { return -1001; }
long clGetKernelSubGroupInfo(void) { return -1001; }
long clGetKernelWorkGroupInfo(void) { return -1001; }
long clGetPlatformIDs(void) { return -1001; }
long clGetPlatformInfo(void) { return -1001; }
long clGetProgramBuildInfo(void) { return -1001; }
long clGetProgramInfo(void) { return -1001; }
long clReleaseEvent(void) { return -1001; }
long clReleaseKernel(void) { return -1001; }
long clReleaseMemObject(void) { return -1001; }
long clReleaseProgram(void) { return -1001; }
long clSetKernelArg(void) { return -1001; }
long clWaitForEvents(void) { return -1001; }
