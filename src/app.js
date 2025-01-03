//In summary, use app.get() for defining GET-specific routes and app.use() for applying middleware or handling requests for multiple methods.
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
})) //cors is used for fetching data from our frontend
app.use(express.json({limit: "16kb"})) //when taking input of data from form
app.use(express.urlencoded({extended: true, limit: "16kb" })) //configuration to take input in form of search%20item(search item), i.e. encoded url; extended for nested objects
app.use(express.static("public")) //for serving files such as html, css, images, etc from a folder/ directory
app.use(cookieParser())


//routes import
import userRouter from '../src/routes/user.routes.js'

//routes declaration
app.use("/api/v1/users", userRouter)

export {app}