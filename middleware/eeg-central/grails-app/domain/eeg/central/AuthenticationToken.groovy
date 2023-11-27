package eeg.central

// https://alvarosanchez.github.io/grails-spring-security-rest/2.0.0.RC1/docs/index.html#_gorm
class AuthenticationToken {

    String tokenValue
    String username

    static mapping = {
        version false
    }
}
