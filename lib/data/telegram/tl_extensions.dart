import 'package:t/t.dart' as t;

/// Small helpers that flatten Telegram's TL "union type" result shapes
/// (`MessagesDialogsBase`, `MessagesMessagesBase`, `UpdatesBase`, ...) into
/// plain lists, since the raw TL schema intentionally models every variant
/// (paged vs. not, slice vs. full, etc.) as its own sealed subclass rather
/// than exposing a single common accessor.
extension MessagesDialogsBaseX on t.MessagesDialogsBase {
  List<t.ChatBase> get chats => switch (this) {
        final t.MessagesDialogs v => v.chats,
        final t.MessagesDialogsSlice v => v.chats,
        _ => const [],
      };

  List<t.MessageBase> get messages => switch (this) {
        final t.MessagesDialogs v => v.messages,
        final t.MessagesDialogsSlice v => v.messages,
        _ => const [],
      };
}

extension MessagesMessagesBaseX on t.MessagesMessagesBase {
  List<t.MessageBase> get messages => switch (this) {
        final t.MessagesMessages v => v.messages,
        final t.MessagesMessagesSlice v => v.messages,
        final t.MessagesChannelMessages v => v.messages,
        _ => const [],
      };

  List<t.ChatBase> get chats => switch (this) {
        final t.MessagesMessages v => v.chats,
        final t.MessagesMessagesSlice v => v.chats,
        final t.MessagesChannelMessages v => v.chats,
        _ => const [],
      };
}

extension UpdatesBaseX on t.UpdatesBase {
  List<t.ChatBase> get chats => switch (this) {
        final t.Updates v => v.chats,
        final t.UpdatesCombined v => v.chats,
        _ => const [],
      };

  /// Flattens every update variant down to the [t.MessageBase] instances
  /// it carries, covering both the "full Updates envelope with a list of
  /// UpdateNewMessage/UpdateNewChannelMessage" case and the shorthand
  /// single-message cases Telegram uses for simple sends.
  List<t.MessageBase> get newMessages {
    final self = this;
    if (self is t.Updates) {
      return self.updates
          .map((u) => switch (u) {
                final t.UpdateNewMessage m => m.message,
                final t.UpdateNewChannelMessage m => m.message,
                _ => null,
              })
          .whereType<t.MessageBase>()
          .toList();
    }
    if (self is t.UpdatesCombined) {
      return self.updates
          .map((u) => switch (u) {
                final t.UpdateNewMessage m => m.message,
                final t.UpdateNewChannelMessage m => m.message,
                _ => null,
              })
          .whereType<t.MessageBase>()
          .toList();
    }
    return const [];
  }
}
