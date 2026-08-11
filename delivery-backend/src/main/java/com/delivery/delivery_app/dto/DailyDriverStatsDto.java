package com.delivery.delivery_app.dto;

import java.math.BigDecimal;

public record DailyDriverStatsDto(
        Long driverId,
        String driverName,
        long processed,
        long delivered,
        BigDecimal deliveredAmount) {
}
