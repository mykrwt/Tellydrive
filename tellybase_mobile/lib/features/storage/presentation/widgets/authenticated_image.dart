import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/config/app_config.dart';
import 'package:tellybase_mobile/core/di/providers.dart';

class _ImageRequest {
  const _ImageRequest({required this.url, this.headers});
  final Map<String, String>? headers;
  final String url;
}

final _imageRequestProvider =
    FutureProvider.autoDispose.family<_ImageRequest, String>((ref, path) async {
  final client = ref.watch(apiClientProvider);
  final sessionStorage = ref.watch(sessionStorageProvider);
  var resolvedPath = path;
  // Ask the authenticated API for a short-lived thumbnail URL first. This
  // prevents the private session cookie from ever entering a cross-host
  // redirect to Telegram's CDN.
  if (path.contains('thumbnail=1')) {
    final separator = path.contains('?') ? '&' : '?';
    final json = await client.getJson('$path${separator}redirect=0');
    final value = json['url'];
    if (value is String && value.isNotEmpty) resolvedPath = value;
  }

  final uri = Uri.parse(resolvedPath);
  if (uri.hasScheme) return _ImageRequest(url: uri.toString());

  final cookie = await sessionStorage.readCookie();
  return _ImageRequest(
    url: AppConfig.resolveUri(resolvedPath).toString(),
    headers: cookie == null ? null : <String, String>{'Cookie': cookie},
  );
});

class AuthenticatedImage extends ConsumerWidget {
  const AuthenticatedImage({
    required this.path,
    this.fit = BoxFit.cover,
    this.borderRadius,
    super.key,
  });

  final BorderRadius? borderRadius;
  final BoxFit fit;
  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = ref.watch(_imageRequestProvider(path));
    final image = request.when(
      data: (value) => Image.network(
        value.url,
        fit: fit,
        headers: value.headers,
        errorBuilder: (_, __, ___) => const _ImageFallback(),
        loadingBuilder: (context, child, progress) => progress == null
            ? child
            : const ColoredBox(
                color: Color(0xFF171D2D),
                child: Center(
                  child: SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ),
      ),
      loading: () => const _ImageFallback(loading: true),
      error: (_, __) => const _ImageFallback(),
    );
    return borderRadius == null
        ? image
        : ClipRRect(borderRadius: borderRadius!, child: image);
  }
}

class _ImageFallback extends StatelessWidget {
  const _ImageFallback({this.loading = false});
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFF171D2D),
      child: Center(
        child: loading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(
                Icons.image_not_supported_outlined,
                color: Colors.white.withValues(alpha: 0.3),
              ),
      ),
    );
  }
}
