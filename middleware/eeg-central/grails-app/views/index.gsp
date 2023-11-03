<%@ page import="grails.util.Environment" %>


<!doctype html>
<html>
<head>
    <meta name="layout" content="main"/>
    <title>Ischl Strom</title>
</head>
<body>



<%
    Environment env = grails.util.Environment.current
    String frameUri = ""
    if (env.name == "development") {
        frameUri = "http://localhost:5173/"
    }
%>

<g:if test="${grails.util.Environment.current.name == "development"}">
    <iframe src="${frameUri}" style="position:fixed; top:0; left:0; bottom:0; right:0; width:100%; height:100%; border:none; margin:0; padding:0; overflow:hidden; z-index:999999;">
        Your browser doesn't support iframes
    </iframe>
</g:if>


</body>
</html>
