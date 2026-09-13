package com.delivery.delivery_app.dto;

/** Exact global counts for the connected driver's workspace filter cards. */
public record DriverWorkspaceSummaryDto(
        long all,
        long distribution,
        long confirmed,
        long toDeliver,
        long delivered,
        long reportedToday,
        long reportedTomorrow) {
}
