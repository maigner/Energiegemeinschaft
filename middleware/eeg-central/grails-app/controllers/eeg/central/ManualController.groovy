package eeg.central

import grails.plugin.springsecurity.annotation.Secured

@Secured("ROLE_ADMIN")
class ManualController {

    def index() {
        render "OK"
    }


}