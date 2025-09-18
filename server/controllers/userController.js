import Stripe from "stripe"
import Course from "../models/course.js"
import { Purchase } from "../models/purchase.js"
import User from "../models/user.js"


//get user data
export const getUserData = async (req,res) => {
    try {
        const userId = req.auth.userId
        const user = await User.findById(userId)

        if(!user){
            return res.status(400).json({success:false,message: 'User not found'})
        }

        res.status(200).json({success:true, user });
    } catch (error) {
        res.status(500).json({success:false,message:error.message});
    }
}

//get user enrolled courses with lecture link
export const userEnrolledCourses = async (req,res) => {
    try {
        const userId = req.auth.userId;
        const userData = await User.findById(userId).populate('enrolledCourses');

        res.status(200).json({success:true,enrolledCourses: userData.enrolledCourses})
    } catch (error) {
        res.status(500).json({success:false,message:error.message})
    }
}

//purchase course
export const purchaseCourse = async (req,res) => {
    try {
        const {courseId} = req.body
        const {origin} = req.headers
        const userId = req.auth.userId
        const userData = await User.findById(userId)
        const courseData = await Course.findById(courseId)

        if(!userData || !courseData) {
            return res.status(400).json({success: false, message: 'Data not found' })
        }

        const purchaseData = {
            courseId : courseData._id,
            userId,
            amount: (courseData.coursePrice - courseData.discount * courseData.coursePrice / 100).toFixed(2),
        }

        const newPurchase = await Purchase.create(purchaseData);

        //Stripe gateway initialize
        const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY)

        const currency = process.env.CURRENCY.toLowerCase();

        //Creating line items to for stripe
        const line_items = [{
            price_data:{
                currency,
                product_data: {
                    name: courseData.courseTitle
                },
                unit_amount: Math.floor(newPurchase.amount) * 100
            },
            quantity: 1
        }]

        const session = await stripeInstance.checkout.sessions.create({
            success_url: `${origin}loading/my-enrollments`,
            cancel_url: `${origin}`,
            line_items: line_items,
            mode: 'payment',
            metadata: {
                purchaseId: newPurchase._id.toString()
            }
        })

        res.json({success:true, session_url: session.url})

    } catch (error) {
        res.status(500).json({success:false,message:error.message})
    }
}