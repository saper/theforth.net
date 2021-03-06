// theforth.net main include file, needs kern.js, see https://github.com/GeraldWodni/kern.js
// (c)copyright 2014-2015 by Gerald Wodni <gerald.wodni@gmail.com>
"use strict";

var _       = require( "underscore" );
var fs      = require( "fs" );
var md5     = require( "md5" );
var path    = require( "path" );

module.exports = {
    setup: function( k ) {

        /* add common values for rendering */
        function vals( req, values ) {
            if( !values )
                values = {};

            _.extend( values, {
                loggedIn: "session" in req
            });

            return values;
        }

        function httpStatus( req, res, code ) {
            k.httpStatus( req, res, code, { values: vals( req ) } );
        }

        var kData = k.getData();

        k.useSiteModule( "/", "theforth.net", "api.js" );

        k.router.get("/confirm/:hash", function( req, res, next ) {
            k.requestman( req );

            var hash = req.requestman.alnum( "hash" );
            k.users.confirmCreate( req.kern.website, hash, function( err, user ) {
                if( err )
                    if( err.message && err.message.indexOf( "Unknown hash" ) == 0 )
                        return k.jade.render( req, res, "confirm", vals( req, { error: { title: "Unknown hash", text:"Please use your link provided your email (visiting this page twice will also trigger this message)." } } ) );
                    else
                        return next( err );

                /* create sql user */
                console.log( "CREATE USER:", user );
                kData.users.create({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    created: new Date()
                });

                k.jade.render( req, res, "confirm" );
            });
        });

        k.router.get("/favicon.ico", k.serveStaticFile( "images/favicon.ico" ) );

        k.router.get("/logout", function( req, res ) {
            req.sessionInterface.destroy( req, res, function() {
                k.jade.render( req, res, "logout" );
            });
        });

        //k.router.use( k.rdb.users.loginRequired( "login" ) );
        k.useSiteModule( "/package", "theforth.net", "packet.js", { setup: { vals: vals } } );

        function renderUser( userLink, req, res, next ) {
            /* user */
            console.log( "RENDER", userLink );
            kData.users.readWhere( "name", [ userLink ], function( err, users ) {
                if( err ) return next( err );
                if( users.length == 0 ) return httpStatus( req, res, 404 );

                /* user's packages */
                var user = users[0];
                kData.packages.readWhere( "user", [ user.id ], function( err, packages ) {
                    if( err ) return next( err );

                    user.emailMd5 = md5( user.email );
                    k.jade.render( req, res, "user", vals( req, { user: user, packages: packages, manage: req.session && user.name==req.session.loggedInUsername, title: user.name } ) );
                });
            });
        }

        k.router.use( "/~:link", function( req, res, next ) {
            k.requestman( req );
            var userLink = req.requestman.id( "link" );

            renderUser( userLink, req, res, next );
        });


        k.router.use( k.users.loginRequired( "login", { path: "/profile" } ) );
        k.useSiteModule( "/profile", "theforth.net", "upload.js", { setup: { vals: vals } } );
        /* upload package */
        k.router.post("/profile/add-package", function( req, res ) {
            k.postman( req, res, function() {
                console.log( "UPLOAD:", req.postman.raw("set") );
                k.jade.render( req, res, "addPackage", vals( req, { title: "Upload package" } ) );
            });
        });
        k.router.get("/profile/add-package", function( req, res ) {
            k.jade.render( req, res, "addPackage", vals( req, { title: "Upload package" } ) );
        });

        /* change password */
        k.router.post("/profile/change-password", function( req, res, next ) {
            k.users.changePassword( req, res, function( err ) {
                if( err )
                    k.jade.render( req, res, "changePassword", vals( req, { title: "Change Password", error: err.message } ) );
                else
                    k.jade.render( req, res, "changePassword", vals( req, { title: "Change Password", success: "Password changed" } ) );
            });
        });
        k.router.get("/profile/change-password", function( req, res ) {
            k.jade.render( req, res, "changePassword", vals( req, { title: "Change Password" } ) );
        });

        k.router.get("/profile", function( req, res, next ) {
            renderUser( req.session.loggedInUsername, req, res, next );
            //res.send( req.session.loggedInUsername );
        });

        /*
        Maybe thats why German did not succeed as a programming language ;)
        k.verteiler.benutze( "/~:verweis", funktion( anf, ant, nächstes ) {
            k.anfragenMann( anf );
            var benutzerVerweis = anf.anfragenMann.id( "verweis" );
            kDatenbank.benutzer.leseWo( "verweis", [ benutzerVerweis ], funktion( fehler, benutzer ) {
                wenn( fehler )
                    antworte nächstes( fehler );

                wenn( benutzer.länge == 0 )
                    antworte k.httpStatus( anf, ant, 404 );

                ant.json( benutzer );
            });
        });
        */

        k.router.get( "/tags", function( req, res, next ) {
            kData.tags.readAll( function( err, tags ) {
                if( err )
                    return next( err );

                k.jade.render( req, res, "tags", vals( req, { tags: tags, title: "Tags" }) );
            });
        });

        k.router.get( "/tag/:name", function( req, res, next ) {
            k.requestman( req );
            var tagName = req.requestman.id( "name" );

            var db = k.getDb();
            db.query( "SELECT packages.name FROM packages INNER JOIN packageTags ON packages.id=packageTags.package"
                + " INNER JOIN tagNames ON packageTags.tag=tagNames.id WHERE tagNames.name = ?",
                [ tagName ], function( err, packets ) {

                if( err )
                    return next( err );

                var header = "Tag '" + tagName + "'";
                var subHeader = "Packages which match the tag";
                k.jade.render( req, res, "packages", vals( req, { packets: packets, title: "Tag '" + tagName + "'",
                    header: header, subHeader: subHeader } ) );
            });
        });

        k.router.get( "/packages", function( req, res, next ) {
            kData.packages.readAll( function( err, packets ) {
                if( err )
                    return next( err );

                k.jade.render( req, res, "packages", vals( req, { packets: packets, title: "Packages" }) );
            });
        });

        k.router.use( "/legacy-users", function( req, res, next ) {
            kData.legacyUsers.readAll( function( err, users ) {
                if( err )
                    return next( err );

                users.forEach( function( user ) {
                    user.emailMd5 = md5( user.email );
                });

                k.jade.render( req, res, "users", vals( req, { users: users, title: "Users" }) );
            });
        });

        k.router.use( "/users", function( req, res, next ) {
            kData.users.readAll( function( err, users ) {
                if( err )
                    return next( err );

                users.forEach( function( user ) {
                    user.emailMd5 = md5( user.email );
                    //user.link = k.filters.id( user.name.replace( /\s+/g, "_" ) );
                });

                //users = users.slice( 25, 35 );

                k.jade.render( req, res, "users", vals( req, { users: users, title: "Users" }) );
            });
        });

        k.router.use( "/ajax", k.siteModule( "theforth.net", "ajax.js" ).router );

        k.router.get("/euroforth2014", function( req, res ) {
            k.jade.render( req, res, "euroforth2014" );
        });

        k.router.get("/c", function( req, res ) {
            k.jade.render( req, res, "console" );
        });

        k.router.get("/about", function( req, res ) {
            k.jade.render( req, res, "about" );
        });

        k.router.get("/guidelines", function( req, res ) {
            k.jade.render( req, res, "guidelines" );
        });

        k.router.get("/api", function( req, res ) {
            k.jade.render( req, res, "api" );
        });

        k.router.get("/legacy", function( req, res ) {
            var websocketHost = "flink.theforth.net";
            if( k.hostname != "4data" )
                websocketHost = "localhost.theforth.net";
            k.jade.render( req, res, "flink", { websocketHost: websocketHost } );
        });

        k.router.get("/contact", function( req, res )  {
            k.jade.render( req, res, "contact", vals( req ) );
        });

        /* gravatar proxy */
        k.proxyCache.gravatar( k.website, k.router );

        k.router.get("/", function( req, res )  {
            k.jade.render( req, res, "home", vals( req ) );
        });

        k.router.all("*", function( req, res ) {
            httpStatus( req, res, 404 );
        });
    }
};
        
