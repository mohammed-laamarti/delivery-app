package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.Role;

public record LoginResponse(String token, Long userId, String name, Role role) {
}
