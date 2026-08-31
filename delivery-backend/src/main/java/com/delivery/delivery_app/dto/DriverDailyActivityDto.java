package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.PackageStatus;
import java.time.LocalDateTime;

/** A parcel handled by a driver on one specific day. */
public record DriverDailyActivityDto(
        PackageDto packageData,
        PackageStatus activityStatus,
        LocalDateTime occurredAt) {
}
