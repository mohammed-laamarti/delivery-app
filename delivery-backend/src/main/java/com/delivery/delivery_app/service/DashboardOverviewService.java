package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.DashboardDriverOverviewDto;
import com.delivery.delivery_app.dto.DashboardOverviewDto;
import com.delivery.delivery_app.dto.DailyDriverStatsDto;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class DashboardOverviewService {
    private final PackageRepository packageRepository;
    private final DeliveryAttemptRepository attemptRepository;
    private final PackageHistoryRepository historyRepository;

    public DashboardOverviewService(PackageRepository packageRepository,
            DeliveryAttemptRepository attemptRepository, PackageHistoryRepository historyRepository) {
        this.packageRepository = packageRepository;
        this.attemptRepository = attemptRepository;
        this.historyRepository = historyRepository;
    }

    public DashboardOverviewDto overview(LocalDate date) {
        LocalDateTime start = date.atStartOfDay();
        LocalDateTime end = date.plusDays(1).atStartOfDay();
        Object[] counts = packageRepository.findDashboardCounts(
                date, start, end,
                List.of(PackageStatus.POSTPONED, PackageStatus.TO_CONFIRM),
                PackageStatus.POSTPONED, PackageStatus.IN_DELIVERY, PackageStatus.DELIVERED,
                DeliveryResult.CLIENT_REQUESTED_POSTPONEMENT).getFirst();
        long confirmedPackages = historyRepository.countDashboardConfirmedPackages(start, end);

        Map<Long, DriverTotals> totals = new HashMap<>();
        for (DailyDriverStatsDto stat : attemptRepository.findDailyDriverStats(start, end, DeliveryResult.DELIVERED,
                PackageStatus.DELIVERED)) {
            totals.put(stat.driverId(), new DriverTotals(stat.driverName(), 0, 0, 0,
                    stat.delivered(), 0, stat.deliveredAmount()));
        }
        merge(totals, packageRepository.findDashboardAssignmentsByDriver(start, end), DriverMetric.ASSIGNED);
        merge(totals, historyRepository.findDashboardConfirmationsByDriver(start, end), DriverMetric.CONFIRMED);
        merge(totals, packageRepository.findDashboardInProgressByDriver(start, end, PackageStatus.IN_DELIVERY), DriverMetric.IN_PROGRESS);
        merge(totals, packageRepository.findDashboardReturnsByDriver(start, end, PackageStatus.DELIVERED), DriverMetric.RETURNS);
        List<DashboardDriverOverviewDto> drivers = totals.entrySet().stream()
                .map(entry -> new DashboardDriverOverviewDto(entry.getKey(), entry.getValue().name,
                        entry.getValue().assigned, entry.getValue().confirmed, entry.getValue().inProgress,
                        entry.getValue().delivered, entry.getValue().returns, entry.getValue().deliveredAmount))
                .toList();

        return new DashboardOverviewDto(date, number(counts[0]), confirmedPackages,
                attemptRepository.countDailyDeliveredPackages(start, end, DeliveryResult.DELIVERED,
                        PackageStatus.DELIVERED),
                number(counts[1]), number(counts[2]), number(counts[3]), drivers);
    }

    private long number(Object value) {
        return value == null ? 0 : ((Number) value).longValue();
    }

    private void merge(Map<Long, DriverTotals> totals, List<Object[]> rows, DriverMetric metric) {
        for (Object[] row : rows) {
            Long driverId = ((Number) row[0]).longValue();
            long value = ((Number) row[1]).longValue();
            totals.compute(driverId, (id, current) -> (current == null ? DriverTotals.EMPTY : current).with(metric, value));
        }
    }

    private enum DriverMetric { ASSIGNED, CONFIRMED, IN_PROGRESS, RETURNS }

    private record DriverTotals(String name, long assigned, long confirmed, long inProgress,
            long delivered, long returns, BigDecimal deliveredAmount) {
        private static final DriverTotals EMPTY = new DriverTotals(null, 0, 0, 0, 0, 0, BigDecimal.ZERO);

        private DriverTotals with(DriverMetric metric, long value) {
            return switch (metric) {
                case ASSIGNED -> new DriverTotals(name, assigned + value, confirmed, inProgress, delivered, returns, deliveredAmount);
                case CONFIRMED -> new DriverTotals(name, assigned, confirmed + value, inProgress, delivered, returns, deliveredAmount);
                case IN_PROGRESS -> new DriverTotals(name, assigned, confirmed, inProgress + value, delivered, returns, deliveredAmount);
                case RETURNS -> new DriverTotals(name, assigned, confirmed, inProgress, delivered, returns + value, deliveredAmount);
            };
        }
    }
}
