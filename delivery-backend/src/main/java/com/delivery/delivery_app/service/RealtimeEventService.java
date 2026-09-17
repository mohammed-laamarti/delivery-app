package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.RealtimeChangeDto;
import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.enums.PackageStatus;
import java.io.IOException;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Map;
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
    private static final Set<PackageStatus> SHARED_DRIVER_WORKSPACE_STATUSES = EnumSet.of(
            PackageStatus.TO_CONFIRM, PackageStatus.NO_ANSWER, PackageStatus.VOICEMAIL,
            PackageStatus.OUT_OF_ZONE, PackageStatus.TO_RECEIVE, PackageStatus.AT_AGENCY,
            PackageStatus.CANCELLED);
    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();
    private final Map<SseEmitter, Subscriber> subscribers = new ConcurrentHashMap<>();

    public SseEmitter subscribe(Long userId, boolean admin) {
        SseEmitter emitter = new SseEmitter(CONNECTION_TIMEOUT_MS);
        emitters.add(emitter);
        subscribers.put(emitter, new Subscriber(userId, admin));
        emitter.onCompletion(() -> remove(emitter));
        emitter.onError(error -> remove(emitter));
        emitter.onTimeout(() -> {
            remove(emitter);
            emitter.complete();
        });
        send(emitter, "ready", new RealtimeChangeDto("ready", null));
        return emitter;
    }

    public void packageChanged(Long packageId) {
        broadcast("change", new RealtimeChangeDto("package", packageId));
    }

    /**
     * Sends a package event only to administrators and to drivers whose workspace
     * can contain the package before or after the change. Comparing both states
     * is essential when a parcel leaves the shared confirmation queue.
     */
    public void packageChanged(PackageDto previous, PackageDto current) {
        PackageDto changed = current != null ? current : previous;
        if (changed == null) return;
        boolean sharedWorkspaceChanged = isSharedDriverWorkspaceItem(previous) || isSharedDriverWorkspaceItem(current);
        Set<Long> affectedDriverIds = new HashSet<>();
        addDriverIds(affectedDriverIds, previous);
        addDriverIds(affectedDriverIds, current);
        broadcast("change", new RealtimeChangeDto("package", changed.id()), emitter -> {
            Subscriber subscriber = subscribers.get(emitter);
            // An emitter added by an older caller has no audience metadata; keep
            // it compatible and safe by delivering the event.
            return subscriber == null || subscriber.admin()
                    || sharedWorkspaceChanged || affectedDriverIds.contains(subscriber.userId());
        });
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
        broadcast(name, event, emitter -> true);
    }

    private void broadcast(String name, RealtimeChangeDto event, java.util.function.Predicate<SseEmitter> recipient) {
        emitters.forEach(emitter -> {
            if (recipient.test(emitter)) send(emitter, name, event);
        });
    }

    private void send(SseEmitter emitter, String name, RealtimeChangeDto event) {
        try {
            emitter.send(SseEmitter.event().name(name).data(event));
        } catch (IOException | IllegalStateException exception) {
            // A failed write means that the client connection has already
            // ended. Completing it again may itself fail asynchronously in
            // Tomcat and must not make the business request fail.
            remove(emitter);
        }
    }

    private void remove(SseEmitter emitter) {
        emitters.remove(emitter);
        subscribers.remove(emitter);
    }

    private boolean isSharedDriverWorkspaceItem(PackageDto item) {
        return item != null && (SHARED_DRIVER_WORKSPACE_STATUSES.contains(item.status())
                || item.status() == PackageStatus.POSTPONED && item.driverId() == null);
    }

    private void addDriverIds(Set<Long> target, PackageDto item) {
        if (item == null) return;
        for (Long driverId : new Long[] { item.driverId(), item.lastDriverId(), item.confirmationDriverId(),
                item.confirmationFollowUpDriverId(), item.confirmedByDriverId(), item.agencyReceiverDriverId() }) {
            if (driverId != null) target.add(driverId);
        }
    }

    record Subscriber(Long userId, boolean admin) { }
}
