package eeg.central

import grails.plugin.springsecurity.annotation.Secured

class HealthController {

    @Secured(["IS_AUTHENTICATED_ANONYMOUSLY"])
    def index() {
        render "OK"
    }
}
