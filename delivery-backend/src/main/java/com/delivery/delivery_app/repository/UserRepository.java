package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.UserEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<UserEntity, Long> {
    Optional<UserEntity> findByPhone(String phone);
}
