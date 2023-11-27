package eeg.central

import grails.converters.JSON
import grails.plugin.springsecurity.annotation.Secured


class ApiController {

    @Secured("ROLE_ADMIN")
    def test() {

        def result = [message: "Hi"]

        render result as JSON

    }
}