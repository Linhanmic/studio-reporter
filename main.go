// package main 是特殊声明，告诉编译器这是一个可执行程序的入口，而不是普通库文件
// 编译后会生成一个可以直接运行的 .exe 文件
package main

// import 语句引入其他包（库），相当于去超市买工具
// 括号 () 表示一次导入多个包
import (
	// Go 标准库：解析命令行参数（如 --start）
	"flag"
	// Go 标准库：格式化输出，类似 C 语言的 printf
	"fmt"
	// Go 标准库：输出日志，自带时间戳
	"log"
	// Go 标准库：网络操作，创建 TCP 连接、监听端口等
	"net"
	// Go 标准库：操作系统相关操作，如读环境变量、退出程序
	"os"
	// Go 标准库：字符串与其他类型之间的转换
	"strconv"

	// 第三方库（GitHub）：Gauge 测试框架的 gRPC 消息定义
	"github.com/getgauge/gauge-proto/go/gauge_messages"
	// 第三方库（Google）：gRPC 通信框架
	"google.golang.org/grpc"
)

// const 定义常量——一旦赋值就不能再修改的值
// () 表示批量定义多个常量
const (
	// 输出端口时的前缀文字，Gauge 父进程靠这个前缀来识别端口号
	portPrefix = "Listening on port:"
	// 环境变量的名字
	pluginActionEnv = "studio-reporter_action"
	// 环境变量的期望值
	executionAction = "execution"
	// 读取 gRPC 最大消息大小的环境变量名
	gaugeMaxMsgSize = "gauge_max_message_size"
	// 默认最大消息大小，单位 MB（1024 MB = 1 GB）
	defaultMaxMsgMB = 1024
)

// func 是声明函数的关键字
// main 函数是特殊入口点——程序启动时 Go 运行时自动调用它
// 就像所有故事从第一章开始，Go 程序从 main() 开始执行
func main() {
	// 设置日志格式为标准格式（包含日期和时间）
	// 输出日志时自动加上类似 2026/07/29 14:30:00 的前缀
	log.SetFlags(log.LstdFlags)

	// 定义一个布尔类型的命令行参数 --start，默认值是 false
	// 第三个参数是帮助说明，运行 --help 时会显示
	// start 是 *bool 类型（指针），所以后面要用 *start 来取值
	start := flag.Bool("start", false, "Start the reporter gRPC server for Gauge execution")
	// 真正去解析命令行输入
	// 在这行之前，定义的所有 flag 都只是"声明"，Parse() 之后才会拿到真正的值
	flag.Parse()

	// 保护性检查：如果两个启动条件都不满足，就打印帮助信息并退出
	// !*start：用户没有传 --start 参数
	// os.Getenv(pluginActionEnv) != executionAction：环境变量 studio-reporter_action 的值不是 "execution"
	// && 是逻辑"与"，两边都为 true 时整个条件才为 true
	if !*start && os.Getenv(pluginActionEnv) != executionAction {
		// 打印所有参数的帮助信息
		flag.Usage()
		// 以错误码 1 退出程序（0 表示正常退出）
		os.Exit(1)
	}

	// := 是 Go 的短变量声明 + 赋值运算符，自动推断类型
	// newWSForwarder() 是在其他文件中定义的函数（不在本文件中），创建一个 WebSocket 转发器对象
	// 这个转发器负责把 Gauge 测试执行的事件通过 WebSocket 发送给前端 Studio 界面
	forwarder := newWSForwarder()
	// 调用该对象的 connect 方法，建立 WebSocket 连接
	forwarder.connect()

	// if err := ...; err != nil 是 Go 的惯用写法：在 if 语句中声明变量并检查错误
	// startGRPCServer(forwarder) 调用下面定义的函数，传入转发器
	// 如果启动失败，err 不为 nil
	// log.Fatalf 输出错误日志并立即终止程序（等价于 log.Printf + os.Exit(1)）
	// %v 是格式化占位符，v 表示"以默认格式输出任何值"
	// Go 没有 try/catch，而是每个函数返回 error 作为最后一个返回值，调用者必须显式检查
	if err := startGRPCServer(forwarder); err != nil {
		log.Fatalf("studio-reporter: %v", err)
	}
}

// startGRPCServer 启动 gRPC 服务器
// 接收一个 *wsForwarder 类型的参数（指针，指向 WebSocket 转发器）
// 返回一个 error 类型（如果成功则返回 nil，失败则返回错误信息）
func startGRPCServer(forwarder *wsForwarder) error {
	// net.ResolveTCPAddr 把字符串 "127.0.0.1:0" 解析为 TCP 地址
	// 127.0.0.1 是本机回环地址，只允许本机连接（安全）
	// 端口 0 是一个特殊值：让操作系统自动分配一个空闲端口
	address, err := net.ResolveTCPAddr("tcp", "127.0.0.1:0")
	if err != nil {
		// fmt.Errorf 创建一个新的错误信息
		// %w 是错误包装语法，保留原始错误，方便后续用 errors.Is 或 errors.Unwrap 链式追踪
		return fmt.Errorf("resolve listen address: %w", err)
	}

	// net.ListenTCP 在指定的 TCP 地址上开始监听
	// 成功后 listener 就是一个 TCP 监听器，可以接受客户端连接
	// 比喻：就像在某个电话号码上"开机等电话"
	listener, err := net.ListenTCP("tcp", address)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	// maxMessageSizeMB() 是下面定义的函数，返回最大消息大小（单位 MB）
	// * 1024 * 1024 把 MB 转换为字节（1 MB = 1024 × 1024 = 1,048,576 字节）
	maxMsgSize := maxMessageSizeMB() * 1024 * 1024
	// grpc.NewServer 创建一个 gRPC 服务器，传入两个选项：
	// grpc.MaxRecvMsgSize：最大接收消息大小
	// grpc.MaxSendMsgSize：最大发送消息大小
	// 默认 gRPC 消息大小只有 4MB，测试报告可能很大，所以需要调大
	server := grpc.NewServer(grpc.MaxRecvMsgSize(maxMsgSize), grpc.MaxSendMsgSize(maxMsgSize))
	// &reporterHandler{...} 创建一个 reporterHandler 结构体的实例，& 取其指针
	// 把 server（gRPC 服务器）和 forwarder（WebSocket 转发器）存入结构体字段
	// reporterHandler 定义在其他文件中，负责处理 Gauge 发来的 gRPC 请求
	// 比喻：server 是电话总机，handler 是接线员，forwarder 是接线员手里的转接器
	handler := &reporterHandler{
		server:    server,
		forwarder: forwarder,
	}
	// 把 handler 注册到 gRPC server 上
	// 这样当 Gauge 框架通过 gRPC 调用 Reporter 接口时，请求会被路由到 handler 的对应方法
	gauge_messages.RegisterReporterServer(server, handler)

	// 这行非常重要，是父子进程通信的关键
	// listener.Addr() 返回监听器的地址（net.Addr 接口）
	// .(*net.TCPAddr) 是类型断言，把通用接口转为具体的 *net.TCPAddr 类型
	// .Port 取出端口号
	// fmt.Printf 格式化输出到标准输出
	// 输出示例：Listening on port:54321
	// Gauge 父进程会在标准输出中搜索 "Listening on port:" 前缀，从中提取端口号，然后通过这个端口与插件建立 gRPC 连接
	fmt.Printf("%s%d\n", portPrefix, listener.Addr().(*net.TCPAddr).Port)

	// server.Serve(listener) 是阻塞调用——它会一直运行，不断接受和处理 gRPC 请求，直到服务器被显式关闭
	// 如果出错则返回 error
	return server.Serve(listener)
}

// maxMessageSizeMB 读取环境变量获取最大消息大小（单位 MB）
func maxMessageSizeMB() int {
	// 读取环境变量 gauge_max_message_size 的值
	value := os.Getenv(gaugeMaxMsgSize)
	// 如果环境变量不存在或为空，返回默认值 1024（MB）
	if value == "" {
		return defaultMaxMsgMB
	}
	// strconv.Atoi 把字符串转换为整数（Atoi = ASCII to Integer）
	size, err := strconv.Atoi(value)
	// 如果转换失败（不是数字）或值 ≤ 0，也返回默认值
	if err != nil || size <= 0 {
		return defaultMaxMsgMB
	}
	// 否则返回用户指定的值
	return size
}
