import Course from "../models/course.js"

//Get all courses
export const getAllCourses = async (req,res) => {
    try{    
        const courses = await Course.find({isPublished:true}).select(['-courseContent' , '-enrolledStudents']).populate({path:'educator'})

        res.status(200).json({success : true, courses});
    }catch(error){ 
        res.status(500).json({success:false,message:error.message});
    }
}

//get course by id
export const getCourseId = async (req,res) => {
    const {id} = req.params
    try{
        const courseData = await Course.findById(id).populate({path: 'educator'})  

        //Remove LectureUrl if isPreviewFree is false
        courseData.courseContent.forEach(chapter => {
            chapter.chapterContent.forEach(lecture => {
                if(!lecture.isPreviewFree){
                    lecture.lectureUrl = "";
                }
            })
        })

    res.status(200).json({success:true,courseData});
    }catch(error){
        res.status(500).json({success:false,message:error.message})
    } 
}