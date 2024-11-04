/*Multer handles the initial file upload, while Cloudinary is used for storing, transforming, and serving the files more efficiently.
Why use multer first to upload files instead of uploading them directly?
Multer deals with the initial processing (preliminary checks) and can handle errors locally (file too large, invalid format etc).
Multer can temporarily store files and allows manipulation or reviews or batch processing before final upload.
Custom security measures can be implemented.
*/
import {v2 as cloudinary} from "cloudinary"
import fs from "fs"

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret : process.env.CLOUDINARY_API_SECRET
})

//Writing our own upload function
const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null

        const response = await cloudinary.uploader.upload (localFilePath, {
            resource_type: "auto"
        })
        fs.unlinkSync(localFilePath)
        return response
    } catch (error) {
        fs.unlinkSync(localFilePath)
        return null
    }
}

export {uploadOnCloudinary}