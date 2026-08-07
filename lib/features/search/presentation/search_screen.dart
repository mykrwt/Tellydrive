import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/gallery_grid.dart';
import '../../gallery/presentation/item_viewer_screen.dart';
import '../../library/presentation/library_selectors.dart';

/// Full-text search over original filenames, with instant results as you type.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(searchResultsProvider(_query.trim()));

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          onChanged: (v) => setState(() => _query = v),
          decoration: const InputDecoration(
            hintText: 'Search by filename',
            border: InputBorder.none,
          ),
        ),
        actions: [
          if (_query.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                _controller.clear();
                setState(() => _query = '');
              },
            ),
        ],
      ),
      body: _query.trim().isEmpty
          ? const Center(
              child: Text('Search your photos by original filename.'),
            )
          : results.isEmpty
              ? const Center(child: Text('No results'))
              : GalleryGrid(
                  items: results,
                  onItemTap: (item, index) {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) =>
                            ItemViewerScreen(items: results, initialIndex: index),
                      ),
                    );
                  },
                ),
    );
  }
}
