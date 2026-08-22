package com.delivery.delivery_app.exception;

public class ConfirmationAlreadyClaimedException extends RuntimeException {
    public ConfirmationAlreadyClaimedException() {
        super("Cet appel est deja pris en charge par un autre livreur.");
    }
}
