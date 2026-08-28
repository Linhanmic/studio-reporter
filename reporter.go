// 与 main.go 同属一个包（package main）
// Go 中同一个文件夹下所有 .go 文件必须声明相同的包名，它们共享同一个命名空间
// 这样 main.go 中可以直接调用这里定义的函数和类型，无需导入
package main

// import 语句引入其他包
import (
	"context" // 上下文：用于传递请求的生命周期信号（如超时、取消），gRPC 接口强制要求传入
	"encoding/json"
	"log" // 输出日志
	"os"  // 操作系统功能，这里用 os.Exit(0) 退出程序

	"github.com/getgauge/gauge-proto/go/gauge_messages" // Gauge 测试框架定义的 gRPC 消息类型（如各种 Request、Empty）
	"google.golang.org/grpc"                            // gRPC 服务器相关功能
	"google.golang.org/protobuf/proto"                  // Protocol Buffers 库，proto.Message 是所有 gRPC 消息的公共接口
)

// type ... struct 定义一个结构体——Go 中没有 class，用 struct 来组合数据
type reporterHandler struct {
	// 嵌入字段（Embedded Field），没有名字，是匿名嵌入
	// UnimplementedReporterServer 提供了 Reporter 接口中所有方法的默认空实现
	// 我们只需要覆盖自己关心的方法（如 NotifyExecutionStarting），不用全部实现
	// 这是 gRPC 的设计模式：避免接口变更时代码编译失败
	// 比喻：偏科生抄作业——先抄全科作业（嵌入默认实现），然后把自己擅长的几道题改成正确答案
	gauge_messages.UnimplementedReporterServer
	server    *grpc.Server // 指向 gRPC 服务器的指针，用于后续优雅关闭
	forwarder *wsForwarder // 指向 WebSocket 转发器，用于把事件发送给前端
	live      *livePublisher
}

// forwardEvent 是核心辅助方法，所有 Notify* 方法最终都调用它，避免代码重复
// (h *reporterHandler) 是方法接收者——类似其他语言的 this 或 self
// h 是接收者变量名，*reporterHandler 表示接收者是指针类型
// eventType string：事件类型名（如 "execution_starting"）
// message proto.Message：gRPC 消息。proto.Message 是接口类型，所有 protobuf 消息都实现了它，所以任何 gRPC 请求都可以传进来
func (h *reporterHandler) forwardEvent(eventType string, message proto.Message) {
	// 把事件类型和消息打包成 Studio 前端能理解的格式
	event, err := newStudioEvent(eventType, message)
	if err != nil {
		// 如果打包失败，打印日志并 return（提前退出，不继续转发）
		log.Printf("studio-reporter: failed to build %s event: %v", eventType, err)
		return
	}
	// 通过 WebSocket 转发给前端
	if err := h.forwarder.forward(event); err != nil {
		// 如果转发失败，打印日志（但程序不崩溃）
		log.Printf("studio-reporter: failed to forward %s event: %v", eventType, err)
	}
}

// NotifyExecutionStarting 是 gRPC 回调方法：Gauge 框架在测试执行开始时会自动调用它
// _ context.Context：上下文（本例中不需要，用 _ 丢弃。_ 是 Go 中的"垃圾桶"，表示这个值我不需要）
// req *gauge_messages.ExecutionStartingRequest：gRPC 请求消息
// 返回值：*gauge_messages.Empty（gRPC 响应，Empty = 空响应），error（错误信息，nil = 无错误）
func (h *reporterHandler) NotifyExecutionStarting(_ context.Context, req *gauge_messages.ExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventExecutionStarting, req)
	h.livePub().onExecutionStarting(req.GetCurrentExecutionInfo(), req.GetSuiteResult())
	return &gauge_messages.Empty{}, nil
}

// NotifyExecutionEnding：Gauge 框架在测试执行结束时自动调用
func (h *reporterHandler) NotifyExecutionEnding(_ context.Context, req *gauge_messages.ExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventExecutionEnding, req)
	return &gauge_messages.Empty{}, nil
}

// NotifySpecExecutionStarting：Gauge 框架在某个 Spec 文件开始执行时自动调用
func (h *reporterHandler) NotifySpecExecutionStarting(_ context.Context, req *gauge_messages.SpecExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventSpecExecutionStarting, req)
	h.livePub().onSpecStarting(req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

// NotifySpecExecutionEnding：Gauge 框架在某个 Spec 文件执行结束时自动调用
func (h *reporterHandler) NotifySpecExecutionEnding(_ context.Context, req *gauge_messages.SpecExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventSpecExecutionEnding, req)
	h.livePub().onSpecEnding(req)
	return &gauge_messages.Empty{}, nil
}

// NotifyScenarioExecutionStarting：Gauge 框架在某个场景开始执行时自动调用
func (h *reporterHandler) NotifyScenarioExecutionStarting(_ context.Context, req *gauge_messages.ScenarioExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventScenarioExecutionStarting, req)
	h.livePub().onScenarioStarting(req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

// NotifyScenarioExecutionEnding：Gauge 框架在某个场景执行结束时自动调用
func (h *reporterHandler) NotifyScenarioExecutionEnding(_ context.Context, req *gauge_messages.ScenarioExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventScenarioExecutionEnding, req)
	h.livePub().onScenarioEnding(req)
	return &gauge_messages.Empty{}, nil
}

// NotifyStepExecutionStarting：Gauge 框架在某个步骤开始执行时自动调用
func (h *reporterHandler) NotifyStepExecutionStarting(_ context.Context, req *gauge_messages.StepExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventStepExecutionStarting, req)
	h.livePub().onStepStarting(req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

// NotifyStepExecutionEnding：Gauge 框架在某个步骤执行结束时自动调用
func (h *reporterHandler) NotifyStepExecutionEnding(_ context.Context, req *gauge_messages.StepExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventStepExecutionEnding, req)
	h.livePub().onStepOrConceptEnding(req.GetStepResult(), req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

// NotifyConceptExecutionStarting：Gauge 框架在某个概念（嵌套步骤）开始执行时自动调用
func (h *reporterHandler) NotifyConceptExecutionStarting(_ context.Context, req *gauge_messages.ConceptExecutionStartingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventConceptExecutionStarting, req)
	h.livePub().onStepStarting(req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

// NotifyConceptExecutionEnding：Gauge 框架在某个概念执行结束时自动调用
func (h *reporterHandler) NotifyConceptExecutionEnding(_ context.Context, req *gauge_messages.ConceptExecutionEndingRequest) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventConceptExecutionEnding, req)
	h.livePub().onStepOrConceptEnding(req.GetStepResult(), req.GetCurrentExecutionInfo())
	return &gauge_messages.Empty{}, nil
}

// NotifySuiteResult：Gauge 框架在测试套件执行结束时自动调用，传递最终结果汇总
func (h *reporterHandler) NotifySuiteResult(_ context.Context, req *gauge_messages.SuiteExecutionResult) (*gauge_messages.Empty, error) {
	h.forwardEvent(EventSuiteResult, req)
	if req != nil {
		h.livePub().onSuiteResult(req.GetSuiteResult())
	}
	h.generateAndForwardReport(req)
	return &gauge_messages.Empty{}, nil
}

func (h *reporterHandler) livePub() *livePublisher {
	if h.live == nil {
		h.live = newLivePublisher()
	}
	return h.live
}

func (h *reporterHandler) generateAndForwardReport(req *gauge_messages.SuiteExecutionResult) {
	if shouldSkipReport() {
		return
	}
	generated, err := generateReportFromSuiteTo(req, reportDirFromLive(h.live))
	if err != nil {
		log.Printf("studio-reporter: failed to generate HTML report: %v", err)
		return
	}
	payload, err := json.Marshal(map[string]string{
		"reportPath": generated.IndexPath,
		"jsonPath":   generated.JSONPath,
		"reportDir":  generated.Dir,
	})
	if err != nil {
		log.Printf("studio-reporter: failed to marshal ReportGenerated event: %v", err)
		return
	}
	if err := h.forwarder.forward(newStudioEventPayload(EventReportGenerated, payload)); err != nil {
		log.Printf("studio-reporter: failed to forward %s event: %v", EventReportGenerated, err)
	}
}

// Kill 是 gRPC 回调方法：Gauge 框架要求插件进程退出时调用
func (h *reporterHandler) Kill(_ context.Context, _ *gauge_messages.KillProcessRequest) (*gauge_messages.Empty, error) {
	// go 是 Go 的并发关键字——启动一个新的 goroutine（轻量级线程）来执行 h.stop()
	// 当前函数不等待它完成，立即返回
	// 为什么用 go？gRPC 的 Stop() 或 GracefulStop() 会等待所有正在处理的 RPC 完成
	// 但 Kill 本身就是一个正在处理的 RPC！如果直接调用 stop()：
	//   Kill 方法调用 server.Stop()
	//   server.Stop() 等待 Kill 方法完成
	//   Kill 等待 server.Stop() 完成
	//   → 死锁！两个互相等待，永远卡住
	// 所以用 go 异步执行，让 Kill 方法先返回（告诉 Gauge "我处理完了"），然后 goroutine 再关闭服务器
	go h.stop()
	return &gauge_messages.Empty{}, nil
}

// stop 方法：按顺序关闭各个组件
func (h *reporterHandler) stop() {
	// 关闭顺序很重要：
	h.forwarder.close() // 1. 先关闭 WebSocket 连接（发送关闭消息给前端）
	h.server.Stop()     // 2. 再停止 gRPC 服务器（停止接受新请求）
	os.Exit(0)          // 3. 最后退出进程（0 = 正常退出）
}
