package com.delivery.delivery_app.controller;

import com.delivery.delivery_app.service.RealtimeEventService;
import io.jsonwebtoken.Claims;
import org.springframework.security.core.Authentication;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/realtime")
public class RealtimeController {
    private final RealtimeEventService eventService;

    public RealtimeController(RealtimeEventService eventService) {
        this.eventService = eventService;
    }

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("isAuthenticated()")
    public SseEmitter events(Authentication authentication) {
        Claims claims = (Claims) authentication.getDetails();
        boolean admin = authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
        return eventService.subscribe(claims.get("userId", Long.class), admin);
    }
}
