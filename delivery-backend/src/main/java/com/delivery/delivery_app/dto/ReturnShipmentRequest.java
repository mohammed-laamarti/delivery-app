package com.delivery.delivery_app.dto;

import java.util.List;

public record ReturnShipmentRequest(List<Long> packageIds, String reference) {
}
