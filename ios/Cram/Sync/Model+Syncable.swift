import Foundation

// Conformances live here (not on the model definitions) to keep the `@Model` files focused on the
// domain. The stored properties they require were added to each model in v0.5 Phase 5.

extension Subject: SyncableModel {}
extension Exam: SyncableModel {}
extension Source: SyncableModel {}
extension Card: SyncableModel {}
extension Quiz: SyncableModel {}
extension Question: SyncableModel {}
extension GradeEntry: SyncableModel {}

extension ReviewLog: AppendOnlyModel {}
extension Attempt: AppendOnlyModel {}
