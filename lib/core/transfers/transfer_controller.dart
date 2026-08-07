import 'package:flutter_riverpod/flutter_riverpod.dart';

enum TransferKind { upload, download }
enum TransferState { queued, running, done, failed }

/// A single in-flight (or finished) upload/download.
class TransferStatus {
  const TransferStatus({
    required this.id,
    required this.fileName,
    required this.kind,
    this.state = TransferState.queued,
    this.done = 0,
    this.total = 0,
    this.error,
  });

  final String id;
  final String fileName;
  final TransferKind kind;
  final TransferState state;
  final int done;
  final int total;
  final String? error;

  double get progress => total <= 0 ? 0 : (done / total).clamp(0, 1);

  TransferStatus copyWith({
    TransferState? state,
    int? done,
    int? total,
    String? error,
  }) =>
      TransferStatus(
        id: id,
        fileName: fileName,
        kind: kind,
        state: state ?? this.state,
        done: done ?? this.done,
        total: total ?? this.total,
        error: error ?? this.error,
      );
}

/// Tracks every active/queued/completed transfer so the Downloads screen and
/// per-tile progress indicators render without touching the transport.
class TransferController extends Notifier<List<TransferStatus>> {
  @override
  List<TransferStatus> build() => const [];

  TransferStatus _byId(String id) => state.firstWhere(
        (t) => t.id == id,
        orElse: () => TransferStatus(
          id: id,
          fileName: id,
          kind: TransferKind.upload,
        ),
      );

  void enqueueUpload({
    required String id,
    required String fileName,
    required int total,
  }) =>
      _upsert(
        TransferStatus(
          id: id,
          fileName: fileName,
          kind: TransferKind.upload,
          state: TransferState.queued,
          total: total,
        ),
      );

  void enqueueDownload({
    required String id,
    required String fileName,
    required int total,
  }) =>
      _upsert(
        TransferStatus(
          id: id,
          fileName: fileName,
          kind: TransferKind.download,
          state: TransferState.queued,
          total: total,
        ),
      );

  void setRunning(String id) => _upsert(_byId(id).copyWith(state: TransferState.running));

  void progress(String id, int done, int total) =>
      _upsert(_byId(id).copyWith(state: TransferState.running, done: done, total: total));

  void complete(String id) =>
      _upsert(_byId(id).copyWith(state: TransferState.done, done: _byId(id).total));

  void fail(String id, Object error) =>
      _upsert(_byId(id).copyWith(state: TransferState.failed, error: error.toString()));

  void remove(String id) {
    state = state.where((t) => t.id != id).toList();
  }

  void clearFinished() {
    state = state
        .where((t) => t.state == TransferState.queued || t.state == TransferState.running)
        .toList();
  }

  void _upsert(TransferStatus status) {
    final list = [...state];
    final i = list.indexWhere((t) => t.id == status.id);
    if (i >= 0) {
      list[i] = status;
    } else {
      list.add(status);
    }
    state = list;
  }
}

final transferControllerProvider =
    NotifierProvider<TransferController, List<TransferStatus>>(TransferController.new);
