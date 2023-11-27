package eeg.central

import grails.converters.JSON
import grails.plugin.springsecurity.SpringSecurityService
import grails.plugin.springsecurity.annotation.Secured

@Secured(["ROLE_ADMIN"])
class UserController {

    SpringSecurityService springSecurityService

    def test() {

        println params

        println springSecurityService.getCurrentUser()

        def result = [message: "OK"]

        render result as JSON

    }
}
