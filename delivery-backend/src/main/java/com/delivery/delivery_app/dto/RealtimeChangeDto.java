package com.delivery.delivery_app.dto;

/** A deliberately small notification sent to connected application clients. */
public record RealtimeChangeDto(String type, Long packageId) {
}
