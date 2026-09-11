package com.delivery.delivery_app.controller;

import com.delivery.delivery_app.dto.UserDto;
import com.delivery.delivery_app.dto.UserRequest;
import com.delivery.delivery_app.service.UserService;
import com.delivery.delivery_app.service.RealtimeEventService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/users")
@PreAuthorize("hasRole('ADMIN')")
public class UserController {
    private final UserService service;
    private final RealtimeEventService realtimeEventService;

    public UserController(UserService service, RealtimeEventService realtimeEventService) {
        this.service = service;
        this.realtimeEventService = realtimeEventService;
    }

    @GetMapping
    public List<UserDto> findAll() { return service.findAll(); }

    @GetMapping("/{id}")
    public UserDto findById(@PathVariable Long id) { return service.findById(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto create(@RequestBody UserRequest request) {
        UserDto user = service.create(request);
        realtimeEventService.refreshRequired();
        return user;
    }

    @PutMapping("/{id}")
    public UserDto update(@PathVariable Long id, @RequestBody UserRequest request) {
        UserDto user = service.update(id, request);
        realtimeEventService.refreshRequired();
        return user;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
        realtimeEventService.refreshRequired();
    }
}
