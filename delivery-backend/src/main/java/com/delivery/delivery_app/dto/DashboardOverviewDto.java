package com.delivery.delivery_app.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Dashboard counters are deliberately independent from the parcel preview.
 * The preview may contain 25 rows while these totals still cover the whole day.
 */
public record DashboardOverviewDto(
        LocalDate date,
        long totalPackages,
        long confirmedPackages,
        long deliveredPackages,
        long postponedPackages,
        long inProgressPackages,
        long returnedPackages,
        List<DashboardDriverOverviewDto> drivers) {
}
