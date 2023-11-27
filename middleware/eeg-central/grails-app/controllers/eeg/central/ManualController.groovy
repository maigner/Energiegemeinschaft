package eeg.central

import grails.gorm.transactions.Transactional
import grails.plugin.springsecurity.SpringSecurityService
import grails.plugin.springsecurity.annotation.Secured
import grails.plugin.springsecurity.rest.token.generation.SecureRandomTokenGenerator
import grails.plugin.springsecurity.rest.token.generation.TokenGenerator

@Secured("ROLE_ADMIN")
class ManualController {

    SpringSecurityService springSecurityService

    def index() {
        render "OK-hey"
    }


    @Secured("ROLE_ADMIN")
    @Transactional
    def createToken() {

        def principal  = springSecurityService.principal

        TokenGenerator tg = new SecureRandomTokenGenerator()
        def token = tg.generateAccessToken(principal)

        def authToken = new AuthenticationToken(username: token.principal.username, dateCreated: new Date(), tokenValue: token.accessToken).save(flush: true)

        //render token as JSON

        render "OK-hey-token"
    }

}