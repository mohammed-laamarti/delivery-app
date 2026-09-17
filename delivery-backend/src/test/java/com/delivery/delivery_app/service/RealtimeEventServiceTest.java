package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.enums.PackageStatus;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class RealtimeEventServiceTest {
    @Test
    void removesBrokenConnectionWithoutCompletingItAgain() throws Exception {
        RealtimeEventService service = new RealtimeEventService();
        SseEmitter brokenEmitter = org.mockito.Mockito.mock(SseEmitter.class);
        doThrow(new IllegalStateException("Connexion fermée"))
                .when(brokenEmitter).send(any(SseEmitter.SseEventBuilder.class));
        emittersOf(service).add(brokenEmitter);

        assertDoesNotThrow(() -> service.packageChanged(42L));

        assertFalse(emittersOf(service).contains(brokenEmitter));
        verify(brokenEmitter, never()).complete();
    }

    @Test
    void sendsPrivatePackageChangesOnlyToTheAffectedDriverAndAdministrators() throws Exception {
        RealtimeEventService service = new RealtimeEventService();
        SseEmitter administrator = org.mockito.Mockito.mock(SseEmitter.class);
        SseEmitter assignedDriver = org.mockito.Mockito.mock(SseEmitter.class);
        SseEmitter unrelatedDriver = org.mockito.Mockito.mock(SseEmitter.class);
        register(service, administrator, 99L, true);
        register(service, assignedDriver, 7L, false);
        register(service, unrelatedDriver, 8L, false);

        service.packageChanged(null, packageFor(7L, PackageStatus.ASSIGNED));

        verify(administrator).send(any(SseEmitter.SseEventBuilder.class));
        verify(assignedDriver).send(any(SseEmitter.SseEventBuilder.class));
        verify(unrelatedDriver, never()).send(any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    void keepsSharedQueueChangesVisibleToEveryDriver() throws Exception {
        RealtimeEventService service = new RealtimeEventService();
        SseEmitter firstDriver = org.mockito.Mockito.mock(SseEmitter.class);
        SseEmitter secondDriver = org.mockito.Mockito.mock(SseEmitter.class);
        register(service, firstDriver, 7L, false);
        register(service, secondDriver, 8L, false);

        service.packageChanged(null, packageFor(null, PackageStatus.TO_CONFIRM));

        verify(firstDriver).send(any(SseEmitter.SseEventBuilder.class));
        verify(secondDriver).send(any(SseEmitter.SseEventBuilder.class));
    }

    @SuppressWarnings("unchecked")
    private Set<SseEmitter> emittersOf(RealtimeEventService service) throws ReflectiveOperationException {
        Field field = RealtimeEventService.class.getDeclaredField("emitters");
        field.setAccessible(true);
        return (Set<SseEmitter>) field.get(service);
    }

    @SuppressWarnings("unchecked")
    private Map<SseEmitter, RealtimeEventService.Subscriber> subscribersOf(RealtimeEventService service)
            throws ReflectiveOperationException {
        Field field = RealtimeEventService.class.getDeclaredField("subscribers");
        field.setAccessible(true);
        return (Map<SseEmitter, RealtimeEventService.Subscriber>) field.get(service);
    }

    private void register(RealtimeEventService service, SseEmitter emitter, Long userId, boolean admin)
            throws ReflectiveOperationException {
        emittersOf(service).add(emitter);
        subscribersOf(service).put(emitter, new RealtimeEventService.Subscriber(userId, admin));
    }

    private PackageDto packageFor(Long driverId, PackageStatus status) {
        return new PackageDto(42L, "RT-42", null, "Client", null, null, null, null,
                null, null, null, null, null, null, null, null, null,
                status, driverId, null, null, null, false, null, null, null,
                null, null, false, null, null, null, null, null, null, null);
    }
}
