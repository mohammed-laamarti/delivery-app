package com.delivery.delivery_app.dto;

import java.util.List;

/** Bounded search result and exact counters for the admin return scanner. */
public record ReturnScannerDto(long inDeliveryCount, long pendingDecisionCount,
        long agencyReceivedCount, List<PackageDto> matches) {
}
