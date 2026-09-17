package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.DashboardDriverOverviewDto;
import com.delivery.delivery_app.dto.DashboardOverviewDto;
import com.delivery.delivery_app.dto.DailyDriverStatsDto;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
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

    public DashboardOverviewService(PackageRepository packageRepository,
            DeliveryAttemptRepository attemptRepository) {
        this.packageRepository = packageRepository;
        this.attemptRepository = attemptRepository;
    }

    public DashboardOverviewDto overview(LocalDate date) {
        LocalDateTime start = date.atStartOfDay();
        LocalDateTime end = date.plusDays(1).atStartOfDay();
        Object[] counts = packageRepository.findDashboardCounts(
                date, start, end,
                List.of(PackageStatus.TO_RECEIVE, PackageStatus.AT_AGENCY, PackageStatus.TO_DELIVER,
                        PackageStatus.ASSIGNED, PackageStatus.IN_DELIVERY, PackageStatus.DELIVERED,
                        PackageStatus.RETURNED, PackageStatus.RETURN_SHIPPED),
                List.of(PackageStatus.POSTPONED, PackageStatus.TO_CONFIRM),
                PackageStatus.POSTPONED, PackageStatus.IN_DELIVERY, PackageStatus.DELIVERED,
                DeliveryResult.CLIENT_REQUESTED_POSTPONEMENT).getFirst();

        Map<Long, DriverTotals> totals = new HashMap<>();
        for (DailyDriverStatsDto stat : attemptRepository.findDailyDriverStats(start, end, DeliveryResult.DELIVERED,
                PackageStatus.DELIVERED)) {
            totals.put(stat.driverId(), new DriverTotals(stat.driverName(), stat.processed(), 0,
                    stat.delivered(), stat.deliveredAmount()));
        }
        for (Object[] row : packageRepository.findDashboardInProgressByDriver(start, end, PackageStatus.IN_DELIVERY)) {
            Long driverId = ((Number) row[0]).longValue();
            long inProgress = ((Number) row[1]).longValue();
            totals.compute(driverId, (id, current) -> current == null
                    ? new DriverTotals(null, 0, inProgress, 0, BigDecimal.ZERO)
                    : current.withInProgress(inProgress));
        }
        List<DashboardDriverOverviewDto> drivers = totals.entrySet().stream()
                .map(entry -> new DashboardDriverOverviewDto(entry.getKey(), entry.getValue().name,
                        entry.getValue().processed, entry.getValue().inProgress,
                        entry.getValue().delivered, entry.getValue().deliveredAmount))
                .toList();

        return new DashboardOverviewDto(date, number(counts[0]), number(counts[1]),
                attemptRepository.countDailyDeliveredPackages(start, end, DeliveryResult.DELIVERED,
                        PackageStatus.DELIVERED),
                number(counts[2]), number(counts[3]), number(counts[4]), drivers);
    }

    private long number(Object value) {
        return value == null ? 0 : ((Number) value).longValue();
    }

    private record DriverTotals(String name, long processed, long inProgress,
            long delivered, BigDecimal deliveredAmount) {
        private DriverTotals withInProgress(long value) {
            return new DriverTotals(name, processed, value, delivered, deliveredAmount);
        }
    }
}
