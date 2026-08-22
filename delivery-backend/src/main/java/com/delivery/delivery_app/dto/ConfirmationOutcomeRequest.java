package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.ConfirmationOutcome;
import java.time.LocalDateTime;

public record ConfirmationOutcomeRequest(
        ConfirmationOutcome outcome,
        String comment,
        LocalDateTime nextContactAt) {
}
