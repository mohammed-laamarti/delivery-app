package com.delivery.delivery_app.dto;

import java.math.BigDecimal;

/** Aggregated operational activity for one driver on a dashboard day. */
public record DashboardDriverOverviewDto(
        Long driverId,
        String driverName,
        long processed,
        long inProgress,
        long delivered,
        BigDecimal deliveredAmount) {
}
