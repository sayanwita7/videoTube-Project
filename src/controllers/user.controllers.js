import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { trusted } from "mongoose"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken= refreshToken
        await user.save ({validateBeforeSave: false})

        return {accessToken, refreshToken}

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token.")
    }
}

const registerUser = asyncHandler (async (req, res) => {
  try {
      //get user details
      const {fullName, email, username, password} = req.body
      //validation - not empty
      if (
          [fullName, email, username, password].some((field) => field?.trim() === "")
      ){
          throw new ApiError (400, "All fields are required")
      }
      
      //Check if user already exists: username, email
      const existedUser = await User.findOne({
          $or: [{username} , {email}]
      })
  
      if (existedUser) {
          throw new ApiError (409, "User with email or username already exists.")
      }
      
      //check for images, avatar
      const avatarLocalPath = req.files?.avatar[0]?.path
      //const coverImageLocalPath = req.files?.coverImage[0]?.path
      if (!avatarLocalPath){
          throw new ApiError (400, "Avatar file is required.")
      } //since avatar creation is compulsory
  
      let coverImageLocalPath
      if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
          coverImageLocalPath = req.files.coverImage[0].path
      } //coverImage is not compulsory
      
      //upload to cloudinary and extract url; wait till file upload is complete hence async await
      const avatar = await uploadOnCloudinary(avatarLocalPath)
      const coverImage = await uploadOnCloudinary(coverImageLocalPath)
  
      if (!avatar){
          throw new ApiError(400, "Avatar file is required.")
      }
      
      //create user object- create entry in database
      const user = await User.create({
          fullName,
          avatar: avatar.url,
          coverImage: coverImage?.url || "",
          email,
          password,
          username: username.toLowerCase()
      })
  
      //check if user is created or blank and remove password and refresh token field from response
      const createdUser = await User.findById(user._id).select ("-password -refreshToken")
      
      if (!createdUser){
          throw new ApiError (500, "Something went wrong while registering the user.")
      }
  
      //return response
      return res.status(201).json (
          new ApiResponse(200), createdUser, "User registered successfully!"
      )
  } catch (error) {
    throw new ApiError(400, "Something went wrong while registering user.")
  }
})

const loginUser = asyncHandler (async (req, res)=> {
    //req body -> data
    const {email, username, password} = req.body
    //Check if the given username or email exists
    
    if (!(username || email)){
        throw new ApiError (400, "Username or Email is required.")
    }

     //Find the user
    const user = await User.findOne({ //await because it takes time to fetch
        $or: [{username}, {email}] //Check the various types
    })

    if (!user){
        throw new ApiError(404, "User does not exist.")
    }

    //Check if the password matches
    const isPasswordValid= await user.isPasswordCorrect(password)
    if (!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials.")
    }
    
    //Generate access token and refresh token
    const {accessToken, refreshToken}= await generateAccessAndRefreshTokens(user._id)
    
    //send cookie
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken") //new object created because calling the database is not that heavy of an operation rn. However, if it is, we can just modify the previous user object too.
    const options = {
        httpOnly: true,
        secure: trusted
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(200,
            {
                user: loggedInUser, accessToken,
                refreshToken //Tokens being sent separately in case the user needs access to these information
            },
            "User logged in successfully!"
        )
    )
})

const logoutUser = asyncHandler (async (req, res) => {
    //We cannot request email and password each time for logout (cumbersome, anyone can log us out) as we do for login
    User.findByIdAndUpdate (req.user._id, 
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: trusted
    }
    return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out."))
})

const refreshAccessToken = asyncHandler (async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken 

    if (!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized Request.")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET )
        const user = await User.findById(decodedToken?._id)
        if (!user){
            throw new ApiError (401, "Invalid Refresh Token.")
        }
        
        if (incomingRefreshToken !== user?.refreshToken){
            throw new ApiError (401, "Expired or used Refresh Token.")
        }
    
        const options ={
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res.status(200)
        .cookie("accessToken", accessToken, options )
        .cookie("refreshToken", newRefreshToken, options )
        .json(
            new ApiResponse (200, {accessToken, refreshToken: newRefreshToken}, "Access token refreshed successfully.")
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res)=> {
     const {oldPassword, newPassword} = req.body
     const user = await User.findById(req.user?._id)
     const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
     
     if (!isPasswordCorrect){
        throw new ApiError (400, "Invalid current password")
     }
     //need to call the pre hook so findByIdAndUpdate is not used
     user.password = newPassword //Goes into the pre hook and since this is modified, it gets hashed.
     await user.save({validateBeforeSave: false})

     return res.status(200)
     .json(new ApiResponse(200, {}, "Password changed successfully."))
})

const getCurrentUser = asyncHandler(async (req,res) => {
    return res.status(200)
    .json(new ApiResponse(200, req.user, "User fetched succesfully."))
})

const updateAccountDetails = asyncHandler(async (req, res)=> {
    const {fullName, email} = req.body

    if (!(fullName||email)){
        throw new ApiError(400, "All fields are required.")
    }

    const user = await User.findByIdAndUpdate(req.user?._id,{
        $set: {fullName, email: email} //two different syntax, both are the same thing
    }, {new: true}).select("-password")

    return res.status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully."))
})

const updateUserAvatar = asyncHandler(async(req,res)=> {
    const avatarLocalPath = req.files?.path
    if (!avatarLocalPath)
    {
        throw new ApiError (400, "Avatar file is required.")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url){
        throw new ApiError(400, "Avatar file is required.")
    }

    const user = await User.findByIdAndUpdate(req.user?._id, {
        $set: {
            avatar: avatar.url
        }}, {new: true}
    ).select("-password")

    return res.status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully."))
})

const updateUserCoverImage = asyncHandler(async(req,res)=> {
    const coverImageLocalPath = req.files?.path
    if (!coverImageLocalPath)
    {
        throw new ApiError (400, "Cover image file is required.")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url){
        throw new ApiError(400, "Cover image file is required.")
    }

    const user = await User.findByIdAndUpdate(req.user?._id, {
        $set: {
            coverImage: coverImage.url
        }}, {new: true}
    ).select("-password")

    return res.status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully."))
})

const getUserChannelProfile = asyncHandler(async(req,res) => {
    const {username} = req.params

    if (!username){
        throw new ApiError(400, "Username is required.")
    }
    //relating different models through aggregate, i.e., say channel and subscribers
    const channel = await User.aggregate([
        {
            $match:{
                username: username?.toLowerCase() //filters the Users collection to find the given username in the url
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            } //adds a field "subscribers" as an array to the user document, performing an outer join between user and subscription collection on the basis of id and channel
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscribers",
                as: "subscribedTo"
            } //adds a field "subscribedTo" as an array to the user document, performing an outer join between user and subscription collection on the basis of id and subscribers
        },
        {
            $addFields:{
                subscribersCount:{
                    $size: "$subscribers"
                },
                channelsSubscribedToCount:{
                    $size: "$subscribedTo"
                },
                isSubscribed:{
                    if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                    then: true,
                    else: false
                }
            } //adds three new fields, the first and second that contains the size of the respective array fields, and the third, a boolean which is true if the req.user is a subscriber to the channel
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email:1
            } //it decides which fields are to be included in the final output
        }
    ])

    if (!channel?.length){
        throw new ApiError(404, "Channel does not exist.")
    }

    return res.status(200).json(new ApiResponse(200, channel[0], "User channel fetched successfully."))
})

export {
    registerUser, 
    loginUser, 
    logoutUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile  }