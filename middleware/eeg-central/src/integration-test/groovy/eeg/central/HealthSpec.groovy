package eeg.central

import grails.testing.mixin.integration.Integration
import spock.lang.AutoCleanup
import spock.lang.Shared
import spock.lang.Specification
import io.micronaut.http.HttpRequest
import io.micronaut.http.client.HttpClient
import grails.testing.spock.OnceBefore

@Integration
class HealthSpec {

    @Shared
    @AutoCleanup
    HttpClient client

    @OnceBefore
    void init() {
        String baseUrl = "http://localhost:$serverPort"
        client = HttpClient.create(new URL(baseUrl))
    }
}
