/*Middleware that works with Express and allows us to easily manage file uploads, 
including storing files on the server or processing them as needed.
File upload handling; Storage options; File filtering(to deny certain file types);
Limitations, error handling
*/
import multer from "multer"

const storage = multer.diskStorage({
    destination: function(req,file, cb){
        cb(null, "./public/temp")
    },
    filename: function (req, file, cb){
        cb(null, file.originalname)
    }
})

export const upload = multer ({storage})