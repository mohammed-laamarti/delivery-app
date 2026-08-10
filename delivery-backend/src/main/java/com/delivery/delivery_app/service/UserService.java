package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.UserDto;
import com.delivery.delivery_app.dto.UserRequest;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.repository.UserRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;

@Service
@Transactional
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<UserDto> findAll() {
        return userRepository.findAll().stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public UserDto findById(Long id) {
        return toDto(getUser(id));
    }

    public UserDto create(UserRequest request) {
        UserEntity user = new UserEntity(null, request.name(), request.phone(), passwordEncoder.encode(request.password()),
                request.role(), request.active());
        return toDto(userRepository.save(user));
    }

    public UserDto update(Long id, UserRequest request) {
        UserEntity user = getUser(id);
        user.setName(request.name());
        user.setPhone(request.phone());
        user.setRole(request.role());
        user.setActive(request.active());
        if (request.password() != null && !request.password().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.password()));
        }
        return toDto(userRepository.save(user));
    }

    public void delete(Long id) {
        userRepository.delete(getUser(id));
    }

    public UserEntity getUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Utilisateur introuvable: " + id));
    }

    public UserEntity findEntityByPhone(String phone) {
        return userRepository.findByPhone(phone)
                .orElseThrow(() -> new org.springframework.security.authentication.BadCredentialsException("Telephone ou mot de passe incorrect"));
    }

    private UserDto toDto(UserEntity user) {
        return new UserDto(user.getId(), user.getName(), user.getPhone(), user.getRole(), user.isActive());
    }
}
