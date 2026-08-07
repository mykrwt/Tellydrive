import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tellybase_mobile/core/di/providers.dart';
import 'package:tellybase_mobile/features/dashboard/domain/entities/dashboard_summary.dart';

final dashboardSummaryProvider = FutureProvider<DashboardSummary>((ref) {
  return ref.watch(getDashboardSummaryProvider)();
});
