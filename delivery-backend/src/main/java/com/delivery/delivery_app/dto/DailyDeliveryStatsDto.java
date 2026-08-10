package com.delivery.delivery_app.dto;

import java.time.LocalDate;

public record DailyDeliveryStatsDto(
        LocalDate date,
        long totalPackagesImported,
        long attempts,
        long delivered,
        long unreachable,
        long postponed,
        long refused,
        long addressNotFound) {
}
