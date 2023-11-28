databaseChangeLog = {

    changeSet(author: "martin (generated)", id: "1701209293320-8") {
        createIndex(indexName: "IX_verification_tokenPK", tableName: "verification_token", unique: "true") {
            column(defaultValueComputed: "nextval('verification_token_id_seq'::regclass)", name: "id")
        }
    }

    changeSet(author: "martin (generated)", id: "1701209293320-1") {
        alterSequence(sequenceName: "hibernate_sequence")
    }

    changeSet(author: "martin (generated)", id: "1701209293320-2") {
        addNotNullConstraint(columnDataType: "varchar(255)", columnName: "email", tableName: "users", validate: "true")
    }

    changeSet(author: "martin (generated)", id: "1701209293320-3") {
        addNotNullConstraint(columnDataType: "timestamp", columnName: "emailVerified", tableName: "users", validate: "true")
    }

    changeSet(author: "martin (generated)", id: "1701209293320-4") {
        addNotNullConstraint(columnDataType: "clob", columnName: "image", tableName: "users", validate: "true")
    }

    changeSet(author: "martin (generated)", id: "1701209293320-5") {
        addNotNullConstraint(columnDataType: "varchar(255)", columnName: "name", tableName: "users", validate: "true")
    }

    changeSet(author: "martin (generated)", id: "1701209293320-6") {
        dropPrimaryKey(tableName: "verification_token")
    }

    changeSet(author: "martin (generated)", id: "1701209293320-7") {
        addPrimaryKey(columnNames: "id", constraintName: "verification_tokenPK", tableName: "verification_token")
    }
}
