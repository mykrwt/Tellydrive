import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/constants/app_text.dart';
import '../../../../core/widgets/common_widgets.dart';
import '../../../drive/domain/entities/drive_file.dart';
import '../../../drive/presentation/providers/drive_provider.dart';
import '../widgets/file_type_filter_chips.dart';
import '../widgets/search_result_item.dart';

final searchQueryProvider = StateProvider<String>((ref) => '');
final searchFilterProvider = StateProvider<DriveFileType?>((ref) => null);

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<DriveFile> _getResults() {
    final query = ref.watch(searchQueryProvider).toLowerCase();
    final filter = ref.watch(searchFilterProvider);
    final allFiles = ref.watch(driveProvider).files;

    final results = allFiles.where((f) {
      final matchesQuery =
          query.isEmpty || f.name.toLowerCase().contains(query);
      final matchesFilter = filter == null || f.type == filter;
      return matchesQuery && matchesFilter;
    }).toList();

    // Newest first — the screen has no sort picker, so this is the only order.
    results.sort((a, b) => b.uploadedAt.compareTo(a.uploadedAt));
    return results;
  }

  @override
  Widget build(BuildContext context) {
    final results = _getResults();
    final query = ref.watch(searchQueryProvider);

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchCtrl,
          autofocus: true,
          decoration: InputDecoration(
            hintText: AppText.searchHint,
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            filled: false,
            suffixIcon: query.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear_rounded),
                    onPressed: () {
                      _searchCtrl.clear();
                      ref.read(searchQueryProvider.notifier).state = '';
                    },
                  )
                : null,
          ),
          style: Theme.of(context).textTheme.titleMedium,
          onChanged: (v) => ref.read(searchQueryProvider.notifier).state = v,
        ),
      ),
      body: Column(
        children: [
          FileTypeFilterChips(
            selected: ref.watch(searchFilterProvider),
            onSelected: (t) =>
                ref.read(searchFilterProvider.notifier).state = t,
          ),
          const Divider(height: 1),
          Expanded(
            child: query.isEmpty && results.isEmpty
                ? const EmptyState(
                    icon: Icons.search_rounded,
                    title: AppText.searchYourFiles,
                    subtitle: AppText.searchSubtitle,
                  )
                : results.isEmpty
                    ? const EmptyState(
                        icon: Icons.search_off_rounded,
                        title: AppText.noResultsFound,
                        subtitle: AppText.noResultsSubtitle,
                      )
                    : ListView.builder(
                        itemCount: results.length,
                        itemBuilder: (_, i) =>
                            SearchResultItem(file: results[i]),
                      ),
          ),
        ],
      ),
    );
  }
}
