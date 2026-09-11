package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.RealtimeChangeDto;
import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Keeps open connections lightweight: clients receive only an id, then request
 * the single parcel that changed. No polling and no full data snapshots.
 */
@Service
public class RealtimeEventService {
    private static final long CONNECTION_TIMEOUT_MS = 0L;
    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(CONNECTION_TIMEOUT_MS);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            emitter.complete();
        });
        send(emitter, "ready", new RealtimeChangeDto("ready", null));
        return emitter;
    }

    public void packageChanged(Long packageId) {
        broadcast("change", new RealtimeChangeDto("package", packageId));
    }

    /** Used for imports, deletes and other operations involving several records. */
    public void refreshRequired() {
        broadcast("change", new RealtimeChangeDto("refresh", null));
    }

    /** Prevents proxies from considering an otherwise idle stream dead. */
    @Scheduled(fixedDelay = 45_000)
    void heartbeat() {
        broadcast("ping", new RealtimeChangeDto("ping", null));
    }

    private void broadcast(String name, RealtimeChangeDto event) {
        emitters.forEach(emitter -> send(emitter, name, event));
    }

    private void send(SseEmitter emitter, String name, RealtimeChangeDto event) {
        try {
            emitter.send(SseEmitter.event().name(name).data(event));
        } catch (IOException | IllegalStateException exception) {
            emitters.remove(emitter);
            emitter.complete();
        }
    }
}
