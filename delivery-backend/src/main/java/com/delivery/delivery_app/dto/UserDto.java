package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.Role;

public record UserDto(Long id, String name, String phone, Role role, boolean active) {
}
