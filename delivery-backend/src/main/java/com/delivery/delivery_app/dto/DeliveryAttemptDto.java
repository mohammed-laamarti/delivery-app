package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.DeliveryResult;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record DeliveryAttemptDto(
        Long id,
        Long packageId,
        Long driverId,
        DeliveryResult result,
        String comment,
        LocalDate nextDate,
        LocalDateTime createdAt) {
}
