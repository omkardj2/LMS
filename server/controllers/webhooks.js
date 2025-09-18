import { Webhook } from "svix";
import User from "../models/User.js";
import Stripe from "stripe";
import Course from "../models/course.js";
import { Purchase } from "../models/purchase.js";

// API controller function to manage clerk user with db

export const clerkWebhooks = async (req,res)=>{
    try {
        const whook = new Webhook(process.env.CLERK_WEBHOOK_SECRET)

        await whook.verify(JSON.stringify(req.body), {
            "svix-id": req.headers["svix-id"],
            "svix-timestamp": req.headers["svix-timestamp"],
            "svix-signature": req.headers["svix-signature"],
        })

        const {data,type} = req.body;

        switch (type) {
            case 'user.created': {
                const userData = {
                    _id: data.id,
                    email: data.email_addresses[0].email_address,
                    name: data.first_name + ' ' + data.last_name,
                    imageUrl: data.image_url,
                }
                await User.create(userData);
                res.json({})
                break;
            }
                
            case 'user.updated': {
                const userData = {
                    email: data.email_addresses[0].email_address,
                    name: data.first_name + ' ' + data.last_name,
                    imageUrl: data.image_url,
                } 
                await User.findByIdAndUpdate(data.id,userData);
                res.json({})
                break;
            }

            case 'user.deleted': {
                await User.findByIdAndDelete(data.id);
                res.json({});
                break;
            }
        
            default:
                break;
        }

    } catch (error) {
        res.json({success:false, message: error.message})
    }
}

const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY)

export const stripeWebhooks = async(request ,response)=>{
    const sig = request.headers['stripe-signature'];

    let event;

    try {
        event = stripeInstance.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        console.error('Webhook verification failed:', err.message);
        return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    try{
        // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':{
            const session = event.data.object;
            const purchaseId = session?.metadata?.purchaseId;

            if (!purchaseId) {
                console.log('No purchaseId found in session metadata');
                break;
            }

            const purchaseData = await Purchase.findById(purchaseId);
            if (!purchaseData) {
                console.log('Purchase not found:', purchaseId);
                break;
            }

            const userData = await User.findById(purchaseData.userId);
            const courseData = await Course.findById(purchaseData.courseId.toString());

            if (!userData || !courseData) {
                console.log('User or course not found');
                break;
            }

            // Push user ID, not the whole user object, and make it idempotent
            if (!courseData.enrolledStudents.some(id => id.toString() === userData._id.toString())) {
                courseData.enrolledStudents.push(userData._id);
                await courseData.save();
            }

            if (!userData.enrolledCourses.some(id => id.toString() === courseData._id.toString())) {
                userData.enrolledCourses.push(courseData._id);
                await userData.save();
            }

            purchaseData.status = 'completed';
            await purchaseData.save();

            console.log('Purchase completed successfully:', purchaseId);
            break;
        }
        case 'payment_intent.payment_failed':{
            const paymentIntent = event.data.object;
            const paymentIntentId = paymentIntent.id;

            const sessions = await stripeInstance.checkout.sessions.list({
                payment_intent: paymentIntentId,
                limit: 1
            });

            if (sessions.data.length === 0) {
                console.log('No session found for payment intent:', paymentIntentId);
                break;
            }

            const purchaseId = sessions.data[0]?.metadata?.purchaseId;
            if (!purchaseId) {
                console.log('No purchaseId in session metadata');
                break;
            }

            const purchaseData = await Purchase.findById(purchaseId);
            if (purchaseData) {
                purchaseData.status = 'failed';
                await purchaseData.save();
                console.log('Purchase marked as failed:', purchaseId);
            }
            
            break;
        }
        // ... handle other event types
        default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    return response.json({received: true});
    }catch(error){
        console.error('Stripe webhook error:', error);
        return response.status(500).json({success: false, message: error.message});
    }
}  