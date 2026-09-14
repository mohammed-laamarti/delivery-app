package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.lang.reflect.Field;
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

    @SuppressWarnings("unchecked")
    private Set<SseEmitter> emittersOf(RealtimeEventService service) throws ReflectiveOperationException {
        Field field = RealtimeEventService.class.getDeclaredField("emitters");
        field.setAccessible(true);
        return (Set<SseEmitter>) field.get(service);
    }
}
