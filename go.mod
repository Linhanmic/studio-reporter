module github.com/gaugestudio/studio-reporter

go 1.26

require (
	github.com/getgauge/gauge-proto/go/gauge_messages v0.0.0-20260401050029-a9cd9db4a825
	google.golang.org/grpc v1.82.0
	google.golang.org/protobuf v1.36.11
)

require (
	github.com/golang/protobuf v1.5.4 // indirect
	golang.org/x/net v0.57.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.40.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260414002931-afd174a4e478 // indirect
)

replace golang.org/x/net => golang.org/x/net v0.57.0
