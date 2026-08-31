package report

// SnapshotBroadcaster pushes live report-tree updates to connected viewers.
// During a run the tree is kept in memory and delivered over WebSocket; disk writes happen only on finalize.
type SnapshotBroadcaster func(snap *LiveSnapshot)
