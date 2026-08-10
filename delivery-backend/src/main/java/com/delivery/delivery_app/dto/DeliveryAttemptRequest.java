package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.DeliveryResult;
import java.time.LocalDate;

public record DeliveryAttemptRequest(
        Long packageId,
        Long driverId,
        DeliveryResult result,
        String comment,
        LocalDate nextDate) {
}
